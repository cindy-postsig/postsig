export const successResponse = new Response(
  JSON.stringify({
    success: true,
  }),
  { headers: { 'Content-Type': 'application/json' }, status: 200 },
);

export const errorResponse = new Response(
  JSON.stringify({
    success: false,
  }),
  { headers: { 'Content-Type': 'application/json' }, status: 500 },
);
