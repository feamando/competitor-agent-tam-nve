import { randomBytes, createCipher, createCipheriv, createDecipher, createDecipheriv, scryptSync } from 'crypto';
import { logger } from '@/lib/logger';

interface EncryptionResult {
  encryptedData: string;
  salt: string;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly SALT_LENGTH = 16;

  /**
   * Feature flag to disable encryption (for debugging only)
   */
  private static get ENCRYPTION_DISABLED(): boolean {
    return process.env.DISABLE_ENCRYPTION === 'true';
  }

  /**
   * Generate a secure key from a password and salt
   */
  private static generateKey(password: string, salt: Buffer): Buffer {
    return scryptSync(password, salt, this.KEY_LENGTH);
  }

  /**
   * Get the encryption password from environment or generate a default
   */
  private static getEncryptionPassword(): string {
    const password = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL;
    if (!password) {
      logger.warn('No encryption key found in environment variables, using default');
      return 'default-encryption-key-please-change-in-production';
    }
    return password;
  }

  /**
   * Encrypt sensitive data
   */
  static encrypt(data: string): EncryptionResult {
    // Bypass encryption if disabled (for debugging)
    if (this.ENCRYPTION_DISABLED) {
      logger.warn('ENCRYPTION DISABLED - storing data in plain text (development only)');
      return {
        encryptedData: 'PLAIN:' + data,
        salt: 'no-salt-needed'
      };
    }

    try {
      const password = this.getEncryptionPassword();
      logger.info('Encryption started', {
        passwordSource: process.env.ENCRYPTION_KEY ? 'ENCRYPTION_KEY' : (process.env.DATABASE_URL ? 'DATABASE_URL' : 'default'),
        passwordLength: password.length,
        dataLength: data.length
      });
      
      const salt = randomBytes(this.SALT_LENGTH);
      const key = this.generateKey(password, salt);
      const iv = randomBytes(this.IV_LENGTH);
      
      logger.info('Encryption keys generated', {
        saltLength: salt.length,
        keyLength: key.length,
        ivLength: iv.length
      });
      
      const cipher = createCipheriv(this.ALGORITHM, key, iv);
      cipher.setAutoPadding(true);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Combine IV and encrypted data
      const encryptedData = iv.toString('hex') + ':' + encrypted;
      
      logger.info('Encryption completed successfully', {
        encryptedDataLength: encryptedData.length,
        saltHex: salt.toString('hex'),
        hasColon: encryptedData.includes(':')
      });
      
      return {
        encryptedData,
        salt: salt.toString('hex')
      };
    } catch (error) {
      logger.error('Encryption failed', error as Error, {
        errorType: error?.constructor.name,
        errorMessage: (error as Error).message
      });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedData: string, salt: string): string {
    // Handle plain text data (when encryption is disabled)
    if (this.ENCRYPTION_DISABLED && encryptedData.startsWith('PLAIN:')) {
      logger.warn('ENCRYPTION DISABLED - reading plain text data');
      return encryptedData.substring(6); // Remove 'PLAIN:' prefix
    }
    
    // Handle legacy plain text data
    if (encryptedData.startsWith('PLAIN:')) {
      logger.warn('Reading legacy plain text data');
      return encryptedData.substring(6);
    }

    try {
      const password = this.getEncryptionPassword();
      logger.info('Decryption started', {
        passwordSource: process.env.ENCRYPTION_KEY ? 'ENCRYPTION_KEY' : (process.env.DATABASE_URL ? 'DATABASE_URL' : 'default'),
        passwordLength: password.length,
        encryptedDataLength: encryptedData.length,
        saltLength: salt.length
      });
      
      const saltBuffer = Buffer.from(salt, 'hex');
      const key = this.generateKey(password, saltBuffer);
      
      const [ivHex, encrypted] = encryptedData.split(':');
      if (!ivHex || !encrypted) {
        logger.error('Invalid encrypted data format', new Error('Missing IV or encrypted data'), {
          ivHex: ivHex?.length || 0,
          encrypted: encrypted?.length || 0,
          fullData: encryptedData.substring(0, 50) + '...'
        });
        throw new Error('Invalid encrypted data format');
      }
      
      logger.info('Decryption components parsed', {
        ivHexLength: ivHex.length,
        encryptedLength: encrypted.length,
        keyLength: key.length
      });
      
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = createDecipheriv(this.ALGORITHM, key, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      logger.info('Decryption completed successfully', {
        decryptedLength: decrypted.length
      });
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', error as Error, {
        errorType: error?.constructor.name,
        errorMessage: (error as Error).message,
        encryptedDataPreview: encryptedData.substring(0, 50) + '...',
        saltPreview: salt.substring(0, 20) + '...'
      });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt AWS credentials
   */
  static encryptCredentials(credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }): {
    encryptedAccessKey: string;
    encryptedSecretKey: string;
    encryptedSessionToken?: string;
    salt: string;
  } {
    const salt = randomBytes(this.SALT_LENGTH).toString('hex');
    
    const accessKeyResult = this.encrypt(credentials.accessKeyId);
    const secretKeyResult = this.encrypt(credentials.secretAccessKey);
    
    const result = {
      encryptedAccessKey: accessKeyResult.encryptedData,
      encryptedSecretKey: secretKeyResult.encryptedData,
      salt
    };

    if (credentials.sessionToken) {
      const sessionTokenResult = this.encrypt(credentials.sessionToken);
      (result as any).encryptedSessionToken = sessionTokenResult.encryptedData;
    }

    return result;
  }

  /**
   * Decrypt AWS credentials
   */
  static decryptCredentials(encryptedCredentials: {
    encryptedAccessKey: string;
    encryptedSecretKey: string;
    encryptedSessionToken?: string;
    salt: string;
  }): {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  } {
    const accessKeyId = this.decrypt(encryptedCredentials.encryptedAccessKey, encryptedCredentials.salt);
    const secretAccessKey = this.decrypt(encryptedCredentials.encryptedSecretKey, encryptedCredentials.salt);
    
    const result = {
      accessKeyId,
      secretAccessKey
    };

    if (encryptedCredentials.encryptedSessionToken) {
      (result as any).sessionToken = this.decrypt(encryptedCredentials.encryptedSessionToken, encryptedCredentials.salt);
    }

    return result;
  }
} 