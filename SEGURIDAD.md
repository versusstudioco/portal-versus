# Seguridad del Portal VERSUS

Guía para proteger la base de datos (Firebase Realtime Database del proyecto `versus-portal`).

---

## Estado actual (importante)

- La base está **abierta**: hoy cualquiera con la dirección puede leer/escribir.
- Las contraseñas de clientes están en **texto plano**.
- El portal hace login "casero" (no usa Firebase Authentication).

Por eso la seguridad se hace en **2 fases**: la Fase 1 quita el riesgo más grave (que te
borren o dañen la información) **sin romper nada**; la Fase 2 (opcional, más adelante)
cierra la lectura con autenticación real.

---

## ✅ FASE 1 — Aplicar ahora (no rompe el portal)

Qué logra:
- 🔒 Bloquea todo lo que esté **fuera de `vsportal`**.
- 🛡️ **Anti-wipe**: nadie puede borrar/vaciar `db` ni `creds` (la validación rechaza datos nulos
  o sin la estructura esperada). Esto elimina el riesgo de "me borraron todo".
- ✍️ Solo se puede escribir en `db` y `creds` (no crear nodos basura).

### Pasos en la consola de Firebase

1. Entra a **https://console.firebase.google.com** e ingresa al proyecto **`versus-portal`**.
2. Menú izquierdo → **Realtime Database**.
3. Pestaña **Reglas** (Rules).
4. **Copia y pega** el contenido del archivo [`database.rules.json`](database.rules.json) de este repo.
5. Clic en **Publicar** (Publish).
6. Listo. Abre el portal y verifica que todo carga y guarda normal (debería, no cambia el código).

> Si algo dejara de guardar, vuelve a la pestaña Reglas, pon temporalmente
> `".read": true, ".write": true` en la raíz, publica, y avísame para ajustar.

---

## 💾 FASE 1b — Activar copia de seguridad

Para poder **restaurar** si algo pasa:

1. En **Realtime Database** → menú **⋮** (tres puntos, arriba a la derecha) → **Exportar JSON**.
   Guarda ese archivo: es un respaldo manual completo.
2. Recomendado: hazlo **una vez por semana** (o antes de cambios grandes).
   *(El respaldo automático programado requiere el plan Blaze de Firebase; si lo activas,
   te ayudo a configurarlo.)*

---

## 🔐 FASE 2 — Seguridad completa (cuando quieras)

Esto cierra la **lectura** (que un cliente no pueda ver datos de otro, contraseñas encriptadas).
Requiere cambios en el login del portal:

1. Activar **Firebase Authentication** (Email/Password) en la consola.
2. Migrar a contraseñas **encriptadas (hash)** en vez de texto plano.
3. Reestructurar los datos **por marca** y reglas tipo:
   - cada cliente lee solo su rama;
   - solo el admin autenticado escribe.
4. (Mejora de velocidad incluida) Al separar por marca, cada cliente descarga **solo sus datos**
   en vez de los 412 KB de todas las marcas → carga mucho más rápida.

Avísame cuando quieras la Fase 2 y la implementamos por etapas para no afectar a los clientes en vivo.

---

## Resumen de "qué tengo que hacer yo"

| Acción | Dónde | Tiempo |
|--------|-------|--------|
| Pegar y publicar `database.rules.json` | Firebase → Realtime DB → Reglas | 2 min |
| Exportar JSON (respaldo) | Firebase → Realtime DB → ⋮ → Exportar | 1 min |
| (Opcional) Pedir Fase 2 | — | cuando quieras |
