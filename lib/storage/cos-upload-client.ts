/**
 * 客户端直传到 COS 的工具函数
 * 使用临时密钥实现安全的客户端直传
 */

import COS from 'cos-js-sdk-v5';

interface STSResponse {
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  startTime: number;
  expiredTime: number;
}

interface UploadCredentials {
  stsData: STSResponse;
  bucket: string;
  region: string;
  cdnDomain: string;
}

/**
 * 获取 COS 临时凭证
 */
async function getCredentials(folder: string): Promise<UploadCredentials> {
  const response = await fetch('/api/cos-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '获取上传凭证失败');
  }

  return response.json();
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * 客户端直传文件到 COS
 * @param file - 要上传的文件
 * @param key - 存储路径（不含文件夹前缀）
 * @param folder - 文件夹前缀
 * @returns CDN 加速 URL
 */
export async function uploadToCosDirect(
  file: File,
  key: string,
  folder: 'albums' | 'gallery' | 'poses' | 'releases'
): Promise<string> {
  // 文件大小检查
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`);
  }

  // 获取临时凭证
  const { stsData, bucket, region, cdnDomain } = await getCredentials(folder);

  // 创建 COS 客户端
  const cos = new COS({
    getAuthorization: (_options, callback) => {
      callback({
        TmpSecretId: stsData.credentials.tmpSecretId,
        TmpSecretKey: stsData.credentials.tmpSecretKey,
        SecurityToken: stsData.credentials.sessionToken,
        StartTime: stsData.startTime,
        ExpiredTime: stsData.expiredTime,
      });
    },
  });

  // 上传文件
  const fullKey = `${folder}/${key}`;

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: fullKey,
        Body: file,
      },
      (err) => {
        if (err) {
          reject(new Error(`上传失败: ${err.message}`));
        } else {
          resolve(`${cdnDomain}/${fullKey}`);
        }
      }
    );
  });
}
