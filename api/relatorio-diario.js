const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://skfuzicygdjmlpxquejt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrZnV6aWN5Z2RqbWxweHF1ZWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTAxODUsImV4cCI6MjA5MDA2NjE4NX0.EOvxHUd8TazpJv0Iw0eEc2VYdxIdJ4dnFqCcYKTG6fo';
const RESEND_KEY = 're_6JHyMiQA_FAPJnBfBwfq7xrSgSvjDjnee';
const EMAIL_TO = 'alex@sptraducoes.com.br';
const EMAIL_FROM = 'relatorio@sptraducoes.com.br';

module.exports = async function handler(req, res) {
  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Brazil is UTC-3
    // To get "today in Brazil", we need UTC+3h window
    // e.g. 2026-06-12 in Brazil = 2026-06-12T03:00:00Z to 2026-06-13T03:00:00Z in UTC

    let targetDate;
    if (req.query && req.query.date) {
      targetDate = req.query.date; // YYYY-MM-DD in Brazil time
    } else {
      // Get current date in Brazil
      targetDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    }

    const [y, m, d] = targetDate.split('-').map(Number);
    // Start: midnight Brazil = 03:00 UTC
    const startUTC = new Date(Date.UTC(y, m-1, d, 3, 0, 0)).toISOString();
    // End: 23:59:59 Brazil = next day 02:59:59 UTC
    const endUTC = new Date(Date.UTC(y, m-1, d+1, 2, 59, 59)).toISOString();

    // Fetch all translations with pagination
    let translations = [];
    let from = 0;
    while (true) {
      const { data, error } = await supa
        .from('translations')
        .select('*, users(name, email)')
        .gte('translated_at', startUTC)
        .lte('translated_at', endUTC)
        .order('translated_at', { ascending: true })
        .range(from, from + 999);
      if (error || !data || data.length === 0) break;
      translations = translations.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    if (translations.length === 0) {
      return res.status(200).json({ 
        message: `Sem traduções em ${targetDate} (busca UTC: ${startUTC} → ${endUTC})` 
      });
    }

    // Group by collaborator
    const byUser = {};
    translations.forEach(t => {
      const name = t.users?.name || '?';
      if (!byUser[name]) byUser[name] = { refs: {}, totalWords: 0, totalFiles: 0 };
      const ref = t.reference || 'Sem referência';
      if (!byUser[name].refs[ref]) byUser[name].refs[ref] = { files: 0, words: 0 };
      byUser[name].refs[ref].files++;
      byUser[name].refs[ref].words += parseInt(t.word_count) || 0;
      byUser[name].totalWords += parseInt(t.word_count) || 0;
      byUser[name].totalFiles++;
    });

    const dateObj = new Date(y, m-1, d);
    const dataFormatada = dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    const totalGeralFiles = Object.values(byUser).reduce((s, u) => s + u.totalFiles, 0);
    const totalGeralWords = Object.values(byUser).reduce((s, u) => s + u.totalWords, 0);
    const totalGeralLaudas = (totalGeralWords / 180).toFixed(2);

    let tabelasColaboradores = '';
    Object.entries(byUser)
      .sort((a, b) => b[1].totalFiles - a[1].totalFiles)
      .forEach(([name, data]) => {
        const laudasTotal = (data.totalWords / 180).toFixed(2);
        const refs = Object.entries(data.refs).sort((a, b) => b[1].files - a[1].files);

        const linhasRefs = refs.map(([ref, r]) => {
          const laudas = (r.words / 180).toFixed(2);
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">
              <span style="background:#1a237e;color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-family:monospace">${ref}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${r.files}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${r.words.toLocaleString('pt-BR')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">
              <span style="background:#e8eaf6;color:#1a237e;padding:2px 8px;border-radius:4px;font-weight:600">${laudas}</span>
            </td>
          </tr>`;
        }).join('');

        tabelasColaboradores += `
        <div style="margin-bottom:28px">
          <div style="background:#1a237e;color:white;padding:10px 16px;border-radius:6px 6px 0 0">
            <span style="font-weight:700;font-size:15px">👤 ${name}</span>
            <span style="font-size:12px;opacity:0.8;float:right">${data.totalFiles} arquivos · ${laudasTotal} laudas</span>
          </div>
          <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e0e0e0;border-top:none">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase">Referência</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;color:#666;text-transform:uppercase">Arquivos</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;color:#666;text-transform:uppercase">Palavras</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;color:#666;text-transform:uppercase">Laudas</th>
              </tr>
            </thead>
            <tbody>${linhasRefs}</tbody>
            <tfoot>
              <tr style="background:#e8eaf6;font-weight:700">
                <td style="padding:8px 12px;color:#1a237e">TOTAL DO DIA</td>
                <td style="padding:8px 12px;text-align:center;color:#1a237e">${data.totalFiles}</td>
                <td style="padding:8px 12px;text-align:center;color:#1a237e">${data.totalWords.toLocaleString('pt-BR')}</td>
                <td style="padding:8px 12px;text-align:center">
                  <span style="background:#1a237e;color:white;padding:2px 10px;border-radius:4px;font-weight:700">${laudasTotal}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>`;
      });

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:700px;margin:0 auto">
    <div style="background:#1a237e;color:white;padding:24px 28px;border-radius:8px 8px 0 0;text-align:center">
      <div style="font-size:22px;font-weight:700;letter-spacing:1px">SP TRADUÇÕES</div>
      <div style="font-size:13px;opacity:0.8;margin-top:4px">Relatório Diário de Produção</div>
      <div style="font-size:16px;margin-top:8px;font-weight:500">${dataFormatada}</div>
    </div>
    <div style="background:white;padding:20px 28px;border:1px solid #e0e0e0;border-top:none;text-align:center">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px">
            <div style="background:#e8eaf6;padding:16px;border-radius:8px">
              <div style="font-size:28px;font-weight:700;color:#1a237e">${totalGeralFiles}</div>
              <div style="font-size:11px;color:#666;text-transform:uppercase;margin-top:4px">Arquivos</div>
            </div>
          </td>
          <td style="padding:8px">
            <div style="background:#e8eaf6;padding:16px;border-radius:8px">
              <div style="font-size:28px;font-weight:700;color:#1a237e">${totalGeralWords.toLocaleString('pt-BR')}</div>
              <div style="font-size:11px;color:#666;text-transform:uppercase;margin-top:4px">Palavras</div>
            </div>
          </td>
          <td style="padding:8px">
            <div style="background:#1a237e;padding:16px;border-radius:8px">
              <div style="font-size:28px;font-weight:700;color:white">${totalGeralLaudas}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-top:4px">Laudas Totais</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
    <div style="background:#f9f9f9;padding:20px 28px;border:1px solid #e0e0e0;border-top:none">
      ${tabelasColaboradores}
    </div>
    <div style="background:#1a237e;color:rgba(255,255,255,0.6);padding:14px 28px;border-radius:0 0 8px 8px;text-align:center;font-size:11px">
      SP Traduções · Relatório gerado automaticamente · ${dataFormatada}
    </div>
  </div>
</body></html>`;

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: EMAIL_TO,
        subject: `📊 Relatório de Produção — ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`,
        html
      })
    });

    const emailData = await emailResp.json();
    if (!emailResp.ok) throw new Error(JSON.stringify(emailData));

    return res.status(200).json({
      success: true,
      message: `E-mail enviado para ${EMAIL_TO}`,
      data: targetDate,
      traducoes: translations.length,
      colaboradores: Object.keys(byUser).length
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
