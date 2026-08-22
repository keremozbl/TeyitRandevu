/**
 * Bu dosya ÜRETİLİR, elle yazılmaz:
 *
 *   npm run db:types
 *
 * Supabase projesi bağlanana kadar geçici bir yer tutucu duruyor. Şema
 * canlıya alındıktan sonra komut çalıştırılıp bu içerik değiştirilecek.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
