'use client';

export function generateToastError(message?: string, title?: string): any {
  const errorMessage =
    message || 'An error occurred. Please try again or contact support.';
  return {
    title: title || 'Error',
    description: errorMessage,
    variant: 'destructive',
  };
}
