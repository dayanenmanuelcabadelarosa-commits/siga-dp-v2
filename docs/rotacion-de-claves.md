# Rotar las claves de las integraciones

Las claves de PayPal, Groq y de la plataforma de facturación quedaron escritas en
el historial de Git (en `servidor/.env.example`, que sí se sube). Por eso hay
que **rotarlas**: una clave que estuvo en un repositorio se da por filtrada,
aunque el repositorio sea local.

Este documento es el procedimiento completo. La regla general es siempre la
misma:

1. Crear la clave nueva en el panel del servicio.
2. Pegarla en `servidor/.env` (ese archivo **no** se sube a Git: está en el
   `.gitignore`).
3. Revocar la clave vieja en el panel del servicio.
4. Correr `npm run claves:verificar` para confirmar que la nueva funciona.
5. `servidor/.env.example` **se queda vacío**: es la plantilla, no el lugar de
   las claves.

---

## 1. La plataforma de facturación electrónica (IMECF)

**Dónde:** el panel de la empresa, *Configuración > API Keys*.

- Cada empresa tiene su propia clave y solo puede tener **una activa**.
- Para rotarla: primero se revoca la activa (la plataforma lo pide: *"Revoque la
  existente antes de crear una nueva"*), después se crea la nueva y se pega en
  `servidor/.env` como `IMECF_API_KEY=...`.
- La clave nueva **solo se muestra una vez**, al crearla. Si se pierde, se
  revoca y se crea otra.
- Verificar: `npm run claves:verificar`. Si la clave sirve pero el último
  comprobante quedó en `ERROR_AL ENVIAR A DGII`, la clave está bien y lo que
  falla es el **certificado de la empresa ante la DGII** (no es cosa de claves).

**Estado al 20 de octubre de 2026:** rotada. La clave vieja (la que estaba en
el historial de Git) está revocada y la nueva está en `servidor/.env`.

---

## 2. Groq (el chat de Doña Pula y las sugerencias)

**Dónde:** https://console.groq.com/keys

1. Crear una clave nueva (la pantalla de Groq la genera al vuelo).
2. Pegarla en `servidor/.env` como `GROQ_API_KEY=...`.
3. Revocar la vieja (la que estuvo en el historial).
4. Verificar: `npm run claves:verificar` (debe decir que el modelo responde).

El modelo se cambia en `GROQ_MODEL` (por defecto `openai/gpt-oss-120b`).

---

## 3. PayPal

**Dónde:** https://developer.paypal.com/dashboard/applications

1. Crear una aplicación **sandbox** nueva (o usar la actual y rotar el secreto).
2. Copiar el *Client ID* y el *Client Secret* a `servidor/.env`:
   `PAYPAL_CLIENT_ID=...` y `PAYPAL_CLIENT_SECRET=...`.
3. Revocar el secreto viejo de la aplicación anterior.
4. **Registrar el webhook** (esto NO se puede hacer por API en el sandbox: hay
   que hacerlo en el panel):
   - *Sandbox > My Apps > tu app > Add Webhook*
   - Evento: `PAYMENT.CAPTURE.COMPLETED`
   - URL: la dirección pública de **esta** máquina, terminada en
     `/api/webhooks/paypal`
   - Copiar el *Webhook ID* a `servidor/.env` como `PAYPAL_WEBHOOK_ID=...`
5. Verificar: `npm run claves:verificar`.

### Ojo con la dirección del túnel

El webhook necesita una dirección pública. Con el túnel de Cloudflare sin
cuenta (`cloudflared tunnel --url http://localhost:4000`) **la dirección cambia
cada vez que se levanta**, así que el webhook queda apuntando a un sitio
muerto y los pagos no avisan.

Para que no se rompa:

- Lo ideal es un **túnel con nombre** (una cuenta de Cloudflare gratis): la
  dirección es fija y el webhook no hay que tocarlo nunca más.
- Mientras se use el túnel temporal, hay que volver a registrar el webhook
  cada vez que se levante (y actualizar `PAYPAL_WEBHOOK_ID`).

El sistema puede cobrar **sin** webhook: la pantalla de cobro vigila el pedido
de PayPal y lo captura cuando el cliente aprueba. El webhook es para el caso en
que el cliente aprueba con la ventana cerrada.

---

## Cómo se comprueba que todo quedó bien

```
npm run claves:verificar
```

Dice, servicio por servicio, si la clave sirve (llama a cada servicio de
verdad, sin cobrar ni enviar nada) y qué falta. Lo mismo se ve en la pantalla
**Integraciones** de la aplicación.

Además, la revisión automática de las pruebas no llama a los servicios de
verdad: quitan las claves un momento para que el resultado no dependa de lo que
haya en el `.env` de la máquina.
