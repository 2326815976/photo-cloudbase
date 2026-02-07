import { createAdminClient, createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import COS from 'cos-nodejs-sdk-v5';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * COS文件删除队列处理API
 * 用于后台任务定期调用，处理待删除的COS文件
 */
export async function POST(request: Request) {
  try {
    // 验证请求来源（优先使用定时任务密钥；否则要求管理员登录）
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;
    const tokenValid = !!expectedToken && authHeader === `Bearer ${expectedToken}`;

    if (!tokenValid) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: '未授权' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: '未授权' }, { status: 403 });
      }
    }

    const supabase = createAdminClient();

    // 获取待删除的文件列表（每次处理100个）
    const { data: pendingDeletions, error: fetchError } = await supabase
      .rpc('get_pending_cos_deletions', { batch_size: 100 });

    if (fetchError) {
      console.error('[COS清理] 获取待删除文件失败:', fetchError);
      return NextResponse.json({
        error: '获取待删除文件失败',
        details: fetchError.message
      }, { status: 500 });
    }

    const deletions = pendingDeletions || [];

    if (deletions.length === 0) {
      return NextResponse.json({
        message: '没有待删除的文件',
        processed: 0
      });
    }

    console.log(`[COS清理] 开始处理 ${deletions.length} 个文件`);

    // 验证环境变量
    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;
    const secretId = process.env.COS_SECRET_ID;
    const secretKey = process.env.COS_SECRET_KEY;

    if (!bucket || !region || !secretId || !secretKey) {
      console.error('[COS清理] COS环境变量未配置');
      return NextResponse.json({
        error: 'COS环境变量未配置',
        details: `缺少: ${!bucket ? 'COS_BUCKET ' : ''}${!region ? 'COS_REGION ' : ''}${!secretId ? 'COS_SECRET_ID ' : ''}${!secretKey ? 'COS_SECRET_KEY' : ''}`
      }, { status: 500 });
    }

    // 初始化COS SDK
    const cos = new COS({
      SecretId: secretId,
      SecretKey: secretKey,
    });

    const successIds: string[] = [];
    const failedIds: string[] = [];

    // 批量删除文件
    for (const deletion of deletions) {
      try {
        // 从URL中提取COS对象键
        const key = extractCosKey(deletion.storage_path);

        if (!key) {
          console.warn(`[COS清理] 无法解析路径: ${deletion.storage_path}`);
          failedIds.push(deletion.id);
          continue;
        }

        // 删除COS文件
        await new Promise((resolve, reject) => {
          cos.deleteObject({
            Bucket: bucket,
            Region: region,
            Key: key,
          }, (err: any, data: any) => {
            if (err) {
              // 如果文件不存在（404），也视为成功
              if (err.statusCode === 404) {
                console.log(`[COS清理] 文件不存在（已删除）: ${key}`);
                resolve(data);
              } else {
                reject(err);
              }
            } else {
              resolve(data);
            }
          });
        });

        successIds.push(deletion.id);
        console.log(`[COS清理] 成功删除: ${key}`);
      } catch (error) {
        console.error(`[COS清理] 删除失败: ${deletion.storage_path}`, error);
        failedIds.push(deletion.id);
      }
    }

    // 更新删除状态
    if (successIds.length > 0) {
      await supabase.rpc('mark_cos_deletion_status', {
        deletion_ids: successIds,
        new_status: 'completed'
      });
    }

    if (failedIds.length > 0) {
      await supabase.rpc('mark_cos_deletion_status', {
        deletion_ids: failedIds,
        new_status: 'failed'
      });
    }

    // 清理旧记录
    await supabase.rpc('cleanup_cos_deletion_queue');

    return NextResponse.json({
      message: 'COS文件清理完成',
      total: deletions.length,
      success: successIds.length,
      failed: failedIds.length
    });

  } catch (error) {
    console.error('[COS清理] 处理失败:', error);
    return NextResponse.json({
      error: 'COS文件清理失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

/**
 * 从COS URL中提取对象键
 * 支持多种URL格式
 */
function extractCosKey(url: string): string | null {
  try {
    // 如果已经是纯路径，直接返回
    if (!url.startsWith('http')) {
      return url.startsWith('/') ? url.substring(1) : url;
    }

    // 解析URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // 移除开头的斜杠
    return pathname.startsWith('/') ? pathname.substring(1) : pathname;
  } catch (error) {
    console.error('[COS清理] URL解析失败:', url, error);
    return null;
  }
}
