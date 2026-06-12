function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return digits;
  return digits;
}

async function sendWhatsAppText(phone, message) {
  const formattedPhone = formatPhone(phone);
  if (!formattedPhone || formattedPhone.length < 12) {
    return { method: 'invalid_phone', sent: false, error: 'Invalid phone number' };
  }

  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'text',
            text: { body: message },
          }),
        }
      );
      if (res.ok) {
        return { method: 'meta', sent: true, phone: formattedPhone };
      }
      console.error('Meta WhatsApp error:', await res.text());
    } catch (e) {
      console.error('Meta WhatsApp failed:', e.message);
    }
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
    try {
      const auth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');
      const body = new URLSearchParams({
        From: process.env.TWILIO_WHATSAPP_FROM,
        To: `whatsapp:+${formattedPhone}`,
        Body: message,
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      );
      if (res.ok) {
        return { method: 'twilio', sent: true, phone: formattedPhone };
      }
      console.error('Twilio WhatsApp error:', await res.text());
    } catch (e) {
      console.error('Twilio WhatsApp failed:', e.message);
    }
  }

  const waLink = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  return { method: 'wa_link', sent: false, waLink, phone: formattedPhone };
}

async function sendPrescriptionWhatsApp(phone, message, pdfUrl = null) {
  const formattedPhone = formatPhone(phone);
  if (!formattedPhone || formattedPhone.length < 12) {
    return { method: 'invalid_phone', sent: false, error: 'Invalid phone number' };
  }

  const fullMessage = pdfUrl
    ? `${message}\n\nDownload Prescription PDF:\n${pdfUrl}`
    : message;

  const publicPdfUrl = pdfUrl && pdfUrl.startsWith('http') ? pdfUrl : null;

  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && publicPdfUrl) {
    try {
      const docRes = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'document',
            document: {
              link: publicPdfUrl,
              filename: 'Prescription.pdf',
              caption: message.slice(0, 1024),
            },
          }),
        }
      );
      if (docRes.ok) {
        return { method: 'meta_document', sent: true, phone: formattedPhone, pdfUrl: publicPdfUrl };
      }
      console.error('Meta WhatsApp document error:', await docRes.text());

      const textRes = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'text',
            text: { body: fullMessage },
          }),
        }
      );
      if (textRes.ok) {
        return { method: 'meta_text', sent: true, phone: formattedPhone, pdfUrl: publicPdfUrl };
      }
      console.error('Meta WhatsApp text error:', await textRes.text());
    } catch (e) {
      console.error('Meta WhatsApp failed:', e.message);
    }
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
    try {
      const auth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');
      const params = {
        From: process.env.TWILIO_WHATSAPP_FROM,
        To: `whatsapp:+${formattedPhone}`,
        Body: fullMessage,
      };
      if (publicPdfUrl) params.MediaUrl = publicPdfUrl;

      const body = new URLSearchParams(params);
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      );
      if (res.ok) {
        return {
          method: publicPdfUrl ? 'twilio_media' : 'twilio',
          sent: true,
          phone: formattedPhone,
          pdfUrl: publicPdfUrl,
        };
      }
      console.error('Twilio WhatsApp error:', await res.text());
    } catch (e) {
      console.error('Twilio WhatsApp failed:', e.message);
    }
  }

  const waLink = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(fullMessage)}`;
  return { method: 'wa_link', sent: false, waLink, phone: formattedPhone, pdfUrl: publicPdfUrl || pdfUrl };
}

module.exports = { formatPhone, sendPrescriptionWhatsApp, sendWhatsAppText };
