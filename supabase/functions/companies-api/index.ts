// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
//@ts-ignore
const COMPANIES_API_KEY = Deno.env.get('COMPANIES_API_KEY');
//@ts-ignore
Deno.serve(async (req) => {
  const { domain } = await req.json();
  const response = await fetch(
    `https://api.thecompaniesapi.com/v2/companies/${domain}?token=${COMPANIES_API_KEY}`,
  );
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/companies-api' \
    --header 'Authorization: Bearer <YOUR_SUPABASE_ANON_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"domain":"example.com"}'

*/
