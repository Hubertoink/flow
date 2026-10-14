import {z} from 'zod';
export function readConfig(env=process.env){
  const production=env.NODE_ENV==='production',url=env.FLOW_URL||'http://localhost:4174';
  const parsed=new URL(url);if(parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('FLOW_URL muss eine Domain ohne Unterpfad sein.');
  if(production&&parsed.protocol!=='https:')throw new Error('Im produktiven Betrieb benötigt FLOW_URL HTTPS.');
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL fehlt. Für lokalen Start: npm run team:local.');
  if(!env.FLOW_AUTH_SECRET||env.FLOW_AUTH_SECRET.length<32)throw new Error('FLOW_AUTH_SECRET muss mindestens 32 Zeichen enthalten.');
  if(!env.FLOW_SETUP_TOKEN||env.FLOW_SETUP_TOKEN.length<24)throw new Error('FLOW_SETUP_TOKEN muss mindestens 24 Zeichen enthalten.');
  const port=z.coerce.number().int().min(1).max(65535).parse(env.FLOW_PORT||4174);
  const proxy=z.coerce.number().int().min(0).max(2).parse(env.FLOW_TRUST_PROXY||0);
  const localMail=!production&&env.FLOW_LOCAL_MAIL==='true';
  if(localMail&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Lokaler Postausgang ist nur auf localhost erlaubt.');
  return {production,url:parsed.origin,port,host:env.FLOW_HOST||(production?'0.0.0.0':'127.0.0.1'),proxy,databaseUrl:env.DATABASE_URL,authSecret:env.FLOW_AUTH_SECRET,setupToken:env.FLOW_SETUP_TOKEN,
    localMail,smtpHost:env.SMTP_HOST||'',smtpPort:Number(env.SMTP_PORT||587),smtpUser:env.SMTP_USER||'',smtpPassword:env.SMTP_PASSWORD||'',mailFrom:env.SMTP_FROM||'Flow! <flow@localhost>'};
}
