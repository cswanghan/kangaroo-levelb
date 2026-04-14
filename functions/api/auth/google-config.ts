interface Env { GOOGLE_CLIENT_ID?: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return new Response(JSON.stringify({
    clientId: context.env.GOOGLE_CLIENT_ID || '',
  }), { headers: { 'Content-Type': 'application/json' } });
};
