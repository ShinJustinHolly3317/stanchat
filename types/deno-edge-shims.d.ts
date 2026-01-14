/* Minimal shims so TS tooling doesn't error on Deno Edge Function remote imports. */

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: unknown
  ): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(...args: any[]): any;
}
