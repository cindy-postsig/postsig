import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  var myHeaders = new Headers();
  myHeaders.append('Authorization', `Bearer ${openAiApiKey}`);
  const supabase = await createClient();
  const formData = await request.formData();
  //   const files = formData.getAll('files') as File[];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(new Error('Unauthorized'), { status: 401 });
  }
  var requestOptions = {
    method: 'POST',
    headers: myHeaders,
    body: formData,
    redirect: 'follow' as RequestRedirect,
  };

  try {
    const response = await fetch(
      'https://api.openai.com/v1/files',
      requestOptions,
    );
    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(error);
  }
}
