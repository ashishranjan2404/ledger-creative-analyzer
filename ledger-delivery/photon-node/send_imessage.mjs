// send_imessage.mjs — sends a Photon iMessage via spectrum-ts cloud mode.
//
// Usage:
//   node send_imessage.mjs <recipient_phone_e164> <text> [attachment_url]
// Env:
//   PHOTON_PROJECT_ID, PHOTON_API_KEY  (required — passed through by Python caller)

import { Spectrum, text, attachment } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const recipient = process.argv[2];
const messageText = process.argv[3];
const attachmentUrl = process.argv[4];

if (!recipient || !messageText) {
  console.error("usage: node send_imessage.mjs <+1234567890> <text> [attachmentUrl]");
  process.exit(1);
}

const projectId = process.env.PHOTON_PROJECT_ID;
const projectSecret = process.env.PHOTON_API_KEY;
if (!projectId || !projectSecret) {
  console.error("PHOTON_PROJECT_ID / PHOTON_API_KEY not set in env");
  process.exit(1);
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

try {
  // `imessage(app)` narrows the Spectrum instance to the iMessage platform,
  // exposing .user() and .space() for constructing outbound Space objects
  // whose .send() method actually delegates to the underlying client.
  const im = imessage(app);
  const user = await im.user(recipient);
  const space = await im.space(user);

  const contents = [text(messageText)];

  if (attachmentUrl) {
    const resp = await fetch(attachmentUrl);
    if (!resp.ok) {
      throw new Error(`Attachment fetch failed: ${resp.status} ${resp.statusText}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const name = attachmentUrl.split("/").pop() ?? "attachment";
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    const extMime = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    }[ext];
    contents.push(
      attachment(buf, {
        name,
        mimeType: resp.headers.get("content-type") ?? extMime ?? "application/octet-stream",
      })
    );
  }

  await space.send(...contents);

  console.log(
    JSON.stringify({
      ok: true,
      recipient,
      user_id: user.id,
      space_id: space.id,
      has_attachment: !!attachmentUrl,
    })
  );
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message ?? String(err) }));
  process.exitCode = 2;
} finally {
  await app.stop();
}
