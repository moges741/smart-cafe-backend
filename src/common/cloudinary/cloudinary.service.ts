import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { UploadedImageFile } from '../interfaces/uploaded-image-file.interface';

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly useCloudinary: boolean;
  private readonly uploadsDir = join(process.cwd(), 'uploads');
  private readonly backendBaseUrl: string;

  // constructor(private readonly configService: ConfigService) {
  //   const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
  //   const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
  //   const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
  //   const port = this.configService.get<string>('PORT') ?? '4000';

  //   this.backendBaseUrl = `http://localhost:${port}`;
  //   this.useCloudinary = Boolean(cloudName && apiKey && apiSecret && /^[a-z0-9][a-z0-9_-]*$/.test(cloudName));
  //   console.log('CLOUDINARY DEBUG', {
  //     cloudName,
  //     apiKeyExists: Boolean(apiKey),
  //     apiSecretExists: Boolean(apiSecret),
  //     regexPasses: cloudName ? /^[a-z0-9][a-z0-9_-]*$/.test(cloudName) : false,
  //   });
  //   if (this.useCloudinary) {
  //     cloudinary.config({
  //       cloud_name: cloudName,
  //       api_key: apiKey,
  //       api_secret: apiSecret,
  //     });
  //   } else {
  //     this.logger.warn('Cloudinary config is missing or invalid; using local uploads fallback.');
  //   }
  // }
constructor(private readonly configService: ConfigService) {
  const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
  const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
  const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
  const port = this.configService.get<string>('PORT') ?? '4000';

  this.backendBaseUrl = `http://localhost:${port}`;

  // Trim to guard against trailing whitespace from .env copy-paste
  const cleanCloudName = cloudName?.trim();
  const cleanApiKey = apiKey?.trim();
  const cleanApiSecret = apiSecret?.trim();

  this.useCloudinary = Boolean(cleanCloudName && cleanApiKey && cleanApiSecret);

  if (this.useCloudinary) {
    cloudinary.config({
      cloud_name: cleanCloudName,
      api_key: cleanApiKey,
      api_secret: cleanApiSecret,
    });
    this.logger.log(`Cloudinary configured — cloud_name: ${cleanCloudName}`);
  } else {
    // Loud and impossible to miss instead of a warning buried in startup logs
    this.logger.error(
      '❌ CLOUDINARY IS NOT CONFIGURED — all image uploads will fall back to local disk storage. ' +
      `Check: CLOUDINARY_CLOUD_NAME=${cleanCloudName ? 'set' : 'MISSING'}, ` +
      `CLOUDINARY_API_KEY=${cleanApiKey ? 'set' : 'MISSING'}, ` +
      `CLOUDINARY_API_SECRET=${cleanApiSecret ? 'set' : 'MISSING'}`
    );
  }
}
  async uploadImage(file: UploadedImageFile, folder: string): Promise<CloudinaryUploadResult> {
    if (!this.useCloudinary) {
      return this.saveLocally(file, folder);
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, result) => {
  if (error || !result) {
    this.logger.error('Cloudinary upload failed', error);
    reject(
      new InternalServerErrorException('Failed to upload image to Cloudinary'),
    );
    return;
  }

          resolve({
            secureUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  private async saveLocally(file: UploadedImageFile, folder: string): Promise<CloudinaryUploadResult> {
    const folderPath = folder.split('/').filter(Boolean).join('/');
    const storageDir = join(this.uploadsDir, folderPath);
    await mkdir(storageDir, { recursive: true });

    const extension = extname(this.getFileNameFromMimeType(file.mimetype));
    const fileName = `${randomUUID()}${extension}`;
    const filePath = join(storageDir, fileName);

    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(filePath);
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
      Readable.from(file.buffer).pipe(writeStream);
    });

    const relativePath = `${folderPath}/${fileName}`;

    return {
      secureUrl: `${this.backendBaseUrl}/uploads/${relativePath}`,
      publicId: relativePath,
    };
  }

  private getFileNameFromMimeType(mimetype: string) {
    if (mimetype === 'image/jpeg') return 'image.jpg';
    if (mimetype === 'image/jpg') return 'image.jpg';
    if (mimetype === 'image/png') return 'image.png';
    if (mimetype === 'image/webp') return 'image.webp';
    if (mimetype === 'image/gif') return 'image.gif';

    return 'image.bin';
  }
}