// CORS headers 共用檔案
// 所有 edge functions 都可以使用這個檔案

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
