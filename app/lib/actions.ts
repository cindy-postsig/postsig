'use server';

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';

const ContractSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  vendorAddress: z.string(),
  vendorEmail: z.email(),
  date: z.string(),
});

const UpdateContract = ContractSchema.omit({ id: true, date: true });

export async function updateContract(
  id: number | undefined,
  formData: FormData,
) {
  const supabaseClient = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const validatedFields = UpdateContract.safeParse({
    vendorId: formData.get('vendorId'),
    vendorName: formData.get('vendorName'),
    vendorAddress: formData.get('vendorAddress'),
    vendorEmail: formData.get('vendorEmail'),
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { vendorId, vendorName, vendorAddress, vendorEmail } =
    validatedFields.data;

  const { data, status, error } = await supabaseClient
    .from('vendors')
    .update({ name: vendorName, address: vendorAddress, email: vendorEmail })
    .eq('id', vendorId)
    .select('*');

  if (error) {
    return {
      message: `Supabase Error: Failed to upload contract. ${error.message}`,
    };
  }
  const updateResponse = await supabaseClient
    .from('contracts')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', data[0].contracts);

  if (updateResponse.error) {
    return {
      message: `Supabase Error: Failed to update contract's updated_at. ${updateResponse.error.message}`,
    };
  }
  revalidatePath(`/contracts/${id}/extract`);
}

export async function sendResendEmail({
  body,
  subject,
  template,
  isHighPriority,
  emailList,
}: {
  body?: string;
  subject: string;
  template?: React.ReactElement;
  isHighPriority?: boolean;
  emailList?: string[];
}) {
  const env = process.env.ENV;
  const isLocal = env === 'local';
  const envSuffix = env && env !== 'prod' ? ` (${env})` : '';
  try {
    const { RESEND_API_KEY } = process.env;
    const resend = new Resend(RESEND_API_KEY);
    const { EMAIL_LIST } = process.env;
    let to = ['mike@postsig.com', 'ziya@postsig.com', 'cindy@postsig.com'];
    if (emailList && emailList.length > 0) {
      to = emailList;
    }
    if (isLocal) {
      to = EMAIL_LIST?.split(',') || [];
    }
    return resend.emails.send({
      from: 'PostSig <noreply@postsig.com>',
      to,
      subject: `${subject}${envSuffix}`,
      html: body && `<p>${body}</p>`,
      react: template,
      headers: {
        'X-Priority': isHighPriority ? '1' : '3 ',
        'X-MSMail-Priority': isHighPriority ? 'High' : 'Normal',
        Importance: isHighPriority ? 'high' : 'normal',
        Priority: isHighPriority ? 'urgent' : 'normal',
        'X-Precedence': isHighPriority ? 'High' : 'normal',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
