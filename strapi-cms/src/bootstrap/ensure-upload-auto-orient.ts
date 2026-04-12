import type { Core } from '@strapi/strapi';

/**
 * 手機直式 JPEG 常把像素存成「橫的」並用 EXIF Orientation 標註；電腦預覽會轉正，Strapi 預設不自動轉。
 * 開啟 Upload 外掛的 autoOrientation 後，上傳時會用 sharp.rotate() 依 EXIF 寫入正確像素（見 @strapi/upload image-manipulation）。
 * 設 STRAPI_SKIP_UPLOAD_AUTO_ORIENTATION=true 可略過。
 */
export async function ensureUploadAutoOrientation(strapi: Core.Strapi): Promise<void> {
  if (process.env.STRAPI_SKIP_UPLOAD_AUTO_ORIENTATION === 'true') {
    return;
  }

  const upload = strapi.plugin('upload').service('upload') as {
    getSettings: () => Promise<Record<string, unknown> | null>;
    setSettings: (v: Record<string, unknown>) => Promise<unknown>;
  };

  const current = (await upload.getSettings()) ?? {};
  if (current.autoOrientation === true) {
    return;
  }

  await upload.setSettings({
    ...current,
    autoOrientation: true
  });
  strapi.log.info('[bootstrap] Upload：已啟用「自動方向」（EXIF），新上傳相片會與手機預覽一致');
}
