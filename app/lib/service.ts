import { uploadOpenAiFileBuffer } from './actions/openai';
import { Readable } from 'stream';

export const blobToStream = (blob: Blob) => {
  const reader = new FileReader();
  reader.readAsArrayBuffer(blob);
  return new Promise<Readable>((resolve, reject) => {
    reader.onloadend = () => {
      const buffer = Buffer.from(reader.result as ArrayBuffer);
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null); // indicates end-of-file basically - the end of the stream
      resolve(stream);
    };
    reader.onerror = (error) => {
      reject(error);
    };
  });
};

export const uploadFileToOpenAi = async (file: any, fileName: any) => {
  try {
    const response = await uploadOpenAiFileBuffer(file, fileName);
    return response;
  } catch (error) {
    console.error('Error uploading file to ai:', fileName);
    throw error;
  }
};

export const uploadFileToOpenAiFtux = async (file: any) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', 'assistants');
  const response = await fetch('/api/openai/uploadFile', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  return data;
};
