import fs from 'node:fs';
import path from 'node:path';

import bypass from './bypass';
import DOMAINS from './domains';

const sendInvalid = (error: string) => new Response(JSON.stringify({ error }), { headers: { 'Content-Type': 'application/json' } });

Bun.serve({
    port: 6440,
    async fetch(request: Request) {
        const url = new URL(request.url);

        if (url.pathname === '/api/sitekey')
            return new Response(JSON.stringify({ sitekey: process.env.CF_SITEKEY || '' }), { headers: { 'Content-Type': 'application/json' } });

        if (url.pathname === '/api/bypass') {
            const jsonRaw = await new Promise((resolve) => {
                request.json().then(data => resolve(data)).catch(() => resolve({}));
            });

            const json: { link: string, token: string, password?: string } = jsonRaw as any;

            if (!json || typeof json !== 'object') return sendInvalid('invalid json body');
            if (!('link' in json) || typeof json.link !== 'string') return sendInvalid('missing link');
            if (!DOMAINS.some((domain) => json.link.startsWith('https://' + domain))) return sendInvalid('that doesn\'t look like a linkvertise link...if this is a mistake, <a href="https://github.com/VillainsRule/nullad/issues" class="underline font-bold">open an issue</a>');
            if (!('token' in json) || typeof json.token !== 'string') return sendInvalid('missing captcha token');

            if (('password' in json) && typeof json.password === 'string') {
                if (json.password !== process.env.ALT_PASSWORD) return sendInvalid('invalid password');                
            } else {
                const cfRequest = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        secret: process.env.CF_SECRETKEY,
                        response: json.token,
                        remoteip: request.headers.get('cf-connecting-ip') || undefined
                    })
                });

                const cfResponse = await cfRequest.json();

                if (!cfResponse.success) {
                    const errorCode = cfResponse['error-codes'] ? cfResponse['error-codes'][0] : 'unknown error';
                    if (errorCode === 'missing-input-secret' || errorCode === 'invalid-input-secret')
                        throw new Error('you have not properly setup cloudflare captchas, consult the README for more information');

                    if (errorCode === 'missing-input-response' || errorCode === 'invalid-input-response')
                        return sendInvalid('captcha failed, please reload & try again.');

                    return sendInvalid('an internal error occured, please reload the page & try again.');
                }
            }

            const result = await bypass(json.link);
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
        }

        if (url.pathname === '/output.css') {
            const css = fs.readFileSync(path.resolve(import.meta.dirname, 'frontend', 'output.css'), 'utf8');
            return new Response(css, { status: 200, headers: { 'Content-Type': 'text/css' } });
        }

        const html = fs.readFileSync(path.resolve(import.meta.dirname, 'frontend', 'index.html'), 'utf8');
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
});

console.log('visit http://localhost:6440 to use nullad!');