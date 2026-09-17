import { NextResponse, NextRequest } from 'next/server';
import compose from '@/utils/compose';

export default function useController(
  functions: any,
  request: NextRequest,
  next: any,
) {
  return compose(functions)({ request }, next).catch((error: any) => {
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: error.status || 500 },
    );
  });
}
