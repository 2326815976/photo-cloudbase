/**
 * 腾讯云COS客户端
 * 用于替代Supabase Storage，解决图片加载慢的问题
 *
 * 存储桶映射（使用文件夹前缀模拟Supabase的多存储桶）：
 * - albums/  : 存放专属返图
 * - gallery/ : 存放照片墙
 * - poses/   : 存放随机姿势图
 * - releases/: 存放APK安装包
 */

import COS from 'cos-nodejs-sdk-v5';

// 延迟创建COS客户端实例，确保环境变量已加载
function getCOSClient() {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;

  if (!secretId || !secretKey) {
    throw new Error(`COS凭证未配置: ${!secretId ? 'COS_SECRET_ID ' : ''}${!secretKey ? 'COS_SECRET_KEY' : ''}`);
  }

  return new COS({
    SecretId: secretId,
    SecretKey: secretKey,
  });
}

/**
 * 上传文件到COS
 * @param file - 文件对象或Buffer
 * @param key - 存储路径（如：albums/timestamp_0_thumbnail.webp）
 * @param folder - 文件夹前缀（albums/gallery/poses/releases）
 * @returns CDN加速URL
 */
export async function uploadToCOS(
  file: File | Buffer,
  key: string,
  folder: 'albums' | 'gallery' | 'poses' | 'releases' = 'albums'
): Promise<string> {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  const cdnDomain = process.env.COS_CDN_DOMAIN;

  if (!bucket || !region || !cdnDomain) {
    throw new Error(`COS环境变量未配置: ${!bucket ? 'COS_BUCKET ' : ''}${!region ? 'COS_REGION ' : ''}${!cdnDomain ? 'COS_CDN_DOMAIN' : ''}`);
  }

  // 将File转换为Buffer（如果需要）
  let body: Buffer;
  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    body = Buffer.from(arrayBuffer);
  } else {
    body = file;
  }

  // 添加文件夹前缀
  const fullKey = `${folder}/${key}`;

  // 上传到COS
  const cos = getCOSClient();
  await cos.putObject({
    Bucket: bucket,
    Region: region,
    Key: fullKey,
    Body: body,
  });

  // 返回CDN加速URL
  return `${cdnDomain}/${fullKey}`;
}

/**
 * 删除COS中的文件
 * @param key - 存储路径（如：albums/timestamp_0_thumbnail.webp）
 */
export async function deleteFromCOS(key: string): Promise<void> {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;

  if (!bucket || !region) {
    throw new Error(`COS环境变量未配置: ${!bucket ? 'COS_BUCKET ' : ''}${!region ? 'COS_REGION' : ''}`);
  }

  const cos = getCOSClient();
  await cos.deleteObject({
    Bucket: bucket,
    Region: region,
    Key: key,
  });
}

/**
 * 批量删除COS中的文件
 * @param keys - 存储路径数组
 */
export async function batchDeleteFromCOS(keys: string[]): Promise<void> {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;

  if (!bucket || !region) {
    throw new Error(`COS环境变量未配置: ${!bucket ? 'COS_BUCKET ' : ''}${!region ? 'COS_REGION' : ''}`);
  }

  const cos = getCOSClient();
  await cos.deleteMultipleObject({
    Bucket: bucket,
    Region: region,
    Objects: keys.map(key => ({ Key: key })),
  });
}

