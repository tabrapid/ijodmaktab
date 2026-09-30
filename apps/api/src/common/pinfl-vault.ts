import { createHmac, hkdfSync } from 'node:crypto';
import { Global, Injectable, Module } from '@nestjs/common';
import { SecretBox } from '../auth/secret-box.js';
import { AppConfig } from '../config/app-config.js';

/**
 * JSHSHIR (PINFL) — shaxsiy ma’lumot: bazada faqat shifrlangan holda (AES-256-GCM) saqlanadi.
 * Takroriy ro‘yxatdan o‘tishni aniqlash uchun alohida kalit bilan hisoblangan HMAC xeshi ishlatiladi
 * (xeshdan raqamni tiklab bo‘lmaydi, shifrlash kalitisiz esa lug‘at hujumi ham mumkin emas).
 */
export class PinflCrypto {
  private readonly box: SecretBox;
  private readonly hashKey: Buffer;

  constructor(encryptionKey: Buffer) {
    this.box = new SecretBox(encryptionKey);
    this.hashKey = Buffer.from(hkdfSync('sha256', encryptionKey, Buffer.alloc(0), 'ijod:pinfl-hash', 32));
  }

  seal(pinfl: string): string {
    return this.box.seal(pinfl);
  }

  open(sealed: string): string {
    return this.box.open(sealed);
  }

  hash(pinfl: string): string {
    return createHmac('sha256', this.hashKey).update(pinfl).digest('hex');
  }

  /** Saqlash uchun: shifrlangan qiymat va xesh (null — JSHSHIR o‘chiriladi). */
  fields(pinfl: string | null) {
    return pinfl
      ? { pinflEncrypted: this.seal(pinfl), pinflHash: this.hash(pinfl) }
      : { pinflEncrypted: null, pinflHash: null };
  }
}

@Injectable()
export class PinflVault extends PinflCrypto {
  constructor(config: AppConfig) {
    super(config.encryptionKey);
  }
}

@Global()
@Module({
  providers: [PinflVault],
  exports: [PinflVault],
})
export class PinflModule {}
