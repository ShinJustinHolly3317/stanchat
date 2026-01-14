import { corsHeaders } from './cors.ts';

export type SuccessEnvelope<T> = {
  code: '0000';
  data: T;
};

export type ErrorEnvelope = {
  code: string;
  message: string;
};

export function jsonOk<T>(data: T, status = 200) {
  const body: SuccessEnvelope<T> = { code: '0000', data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function jsonErr(code: string, message: string, status = 400) {
  const body: ErrorEnvelope = { code, message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

