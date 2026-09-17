'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/ui/button';
import { createClient } from '@/utils/supabase/component';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

export default function UploadContract({
  uid,
  url,
  onUpload,
}: {
  uid: string;
  url?: string;
  onUpload?: (url: string) => void;
}) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const uploadContract: React.ChangeEventHandler<HTMLInputElement> = async (
    event,
  ) => {
    try {
      setUploading(true);

      const files = event.target.files;
      if (!files || files.length === 0) {
        throw new Error('You must select at least one file to upload.');
      }

      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `contract_${Math.random()}.${fileExt}`;
        let filePath: string;
        try {
          filePath = buildSafePath([uid, fileName]);
        } catch (pathError) {
          if (pathError instanceof PathTraversalError) {
            throw new Error('Invalid file path');
          }
          throw pathError;
        }

        // Step 1: Upload the contract file
        const { error: uploadError } = await supabase.storage
          .from('contract_docs')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        // Step 2: Insert into the contracts table
        const { data: contractData, error: contractInsertError } = await (
          supabase.from('contracts').insert as any
        )([
          {
            user_id: uid,
            updated_at: new Date().toISOString(),
          },
        ]).select();

        if (contractInsertError) {
          console.error('Contract insert error:', contractInsertError);
          throw contractInsertError;
        }

        if (!contractData) {
          throw new Error('No contract data returned from insert operation.');
        }
        const contractId = (contractData as any)[0].id;
        // Step 3: Insert into the contract_documents table
        const { error: documentInsertError } = await (
          supabase.from('contract_docs').insert as any
        )([
          {
            user_id: uid,
            file_path: filePath,
            updated_at: new Date().toISOString(),
            contract_id: contractId,
          },
        ]);
        if (documentInsertError) throw documentInsertError;
        return filePath;
      });

      const uploadedFilePaths = await Promise.all(uploadPromises);
    } catch (error) {
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error); // or a default error message
      }
      alert('Error uploading contracts: ' + errorMessage);
    } finally {
      setUploading(false);
      router.refresh();
    }
  };

  return (
    <div>
      <div>
        <Button
          onClick={() => document.getElementById('single')?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading ...' : 'Upload Documents'}
        </Button>
        <input
          style={{
            visibility: 'hidden',
            position: 'absolute',
          }}
          type="file"
          id="single"
          accept=".doc,.docx,.pdf"
          onChange={uploadContract}
          multiple
          disabled={uploading}
        />
      </div>
    </div>
  );
}
