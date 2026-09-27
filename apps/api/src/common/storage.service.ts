import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';

export type StorageArea = 'exports' | 'files' | 'quarantine';
const SAFE_KEY = /^[A-Za-z0-9._-]{1,200}$/;

/**
 * Yopiq fayl ombori (mahalliy disk). Fayllar hech qachon to‘g‘ridan-to‘g‘ri ommaviy havola
 * orqali berilmaydi — faqat ruxsat tekshiruvidan keyin API orqali.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root: string;

  constructor(config: AppConfig) {
    this.root = resolve(config.storageDir);
  }

  async onModuleInit() {
    for (const area of ['exports', 'files', 'quarantine'] as const) {
      await mkdir(join(this.root, area), { recursive: true });
    }
  }

  private path(area: StorageArea, key: string) {
    if (!SAFE_KEY.test(key)) throw new Error(`Noto‘g‘ri fayl kaliti: ${key}`);
    return join(this.root, area, key);
  }

  async write(area: StorageArea, key: string, data: Buffer) {
    await writeFile(this.path(area, key), data, { mode: 0o600 });
  }

  async exists(area: StorageArea, key: string) {
    try {
      await stat(this.path(area, key));
      return true;
    } catch {
      return false;
    }
  }

  stream(area: StorageArea, key: string) {
    return createReadStream(this.path(area, key));
  }

  async remove(area: StorageArea, key: string) {
    await rm(this.path(area, key), { force: true });
  }
}
