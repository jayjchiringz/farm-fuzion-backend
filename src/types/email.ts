/* eslint-disable require-jsdoc */
// src/types/email.ts

// Base email configuration interface
export interface EmailConfig {
  MAIL_USER: string;
  MAIL_PASS: string;
}

// Nodemailer specific error interface
export interface NodemailerError extends Error {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
}

// Return type for email sending functions
export type EmailSendResult = {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
};

// Type guard to check if an error is a NodemailerError
export function isNodemailerError(error: unknown): error is NodemailerError {
  return error instanceof Error && ("code" in error || "command" in error);
}
