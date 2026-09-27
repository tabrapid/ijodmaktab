/** Multer xotirasiga yuklangan fayl (faqat bizga kerakli maydonlar). */
export interface UploadedFileData {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
