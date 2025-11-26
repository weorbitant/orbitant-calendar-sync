import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

/**
 * Deriva una clave de encriptacion desde la clave maestra
 * usando PBKDF2 con un salt unico por encriptacion
 * @param {string} masterKey - Clave maestra
 * @param {Buffer} salt - Salt unico
 * @returns {Buffer} - Clave derivada de 32 bytes
 */
function deriveKey(masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encripta un texto usando AES-256-GCM
 * @param {string} plaintext - Texto a encriptar
 * @param {string} masterKey - Clave maestra (TOKEN_ENCRYPTION_KEY)
 * @returns {string} - Formato: salt:iv:authTag:ciphertext (hex)
 */
export function encrypt(plaintext, masterKey) {
  if (!masterKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY no configurada');
  }

  if (!plaintext) {
    throw new Error('No hay texto para encriptar');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(masterKey, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    ciphertext
  ].join(':');
}

/**
 * Desencripta un texto encriptado con encrypt()
 * @param {string} encryptedData - Datos en formato salt:iv:authTag:ciphertext
 * @param {string} masterKey - Clave maestra (TOKEN_ENCRYPTION_KEY)
 * @returns {string} - Texto original
 */
export function decrypt(encryptedData, masterKey) {
  if (!masterKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY no configurada');
  }

  if (!encryptedData) {
    throw new Error('No hay datos para desencriptar');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Formato de datos encriptados invalido');
  }

  const [saltHex, ivHex, authTagHex, ciphertext] = parts;

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(masterKey, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Genera una clave de encriptacion segura para usar como TOKEN_ENCRYPTION_KEY
 * @returns {string} - Clave de 64 caracteres hex (32 bytes)
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

export default { encrypt, decrypt, generateEncryptionKey };
