import nodemailer from 'nodemailer';
import {randomUUID} from 'node:crypto';

export function createMail(pool,config){
  const transport=config.smtpHost?nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpPort===465,requireTLS:config.production&&config.smtpPort!==465,auth:config.smtpUser?{user:config.smtpUser,pass:config.smtpPassword}:undefined}):null;
  let busy=false;
  return {
    configured:!!transport,
    async enqueue(recipient,subject,text,db=pool){await db.query('INSERT INTO flow_mail(id,recipient,subject,text_body) VALUES($1,$2,$3,$4)',[randomUUID(),recipient,subject,text]);},
    async flush(){if(busy||!transport)return;busy=true;try{const pending=(await pool.query('SELECT * FROM flow_mail WHERE sent_at IS NULL AND attempts<5 ORDER BY created_at LIMIT 10')).rows;for(const m of pending){try{await transport.sendMail({from:config.mailFrom,to:m.recipient,subject:m.subject,text:m.text_body});await pool.query('UPDATE flow_mail SET sent_at=now(),last_error=NULL WHERE id=$1',[m.id]);}catch{await pool.query("UPDATE flow_mail SET attempts=attempts+1,last_error='Versand fehlgeschlagen; SMTP-Konfiguration prüfen.' WHERE id=$1",[m.id]);}}}finally{busy=false;}}
  };
}
