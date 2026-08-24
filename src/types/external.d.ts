declare module "qrcode" {
  export interface QRCodeToBufferOptions {
    type?: "png";
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  }
  export function toBuffer(text: string, options?: QRCodeToBufferOptions): Promise<Uint8Array>;
  const QRCode: { toBuffer: typeof toBuffer };
  export default QRCode;
}

declare module "@larksuiteoapi/node-sdk" {
  export class AESCipher {
    constructor(encryptKey: string);
    decrypt(content: string): string;
  }
}
