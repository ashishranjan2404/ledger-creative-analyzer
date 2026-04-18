# Seedance Prompt — Corporate Debriefer Persona

Source prompt for Sissi's `brief_generator.py`: one 5-second segment per insight, portrait 9:16, stitched together in FFmpeg to form the ~60s morning brief delivered via Photon iMessage.

## Template

```
Cinematic medium shot of a confident professional woman in her early thirties,
dressed in a tailored charcoal-gray blazer over a cream silk blouse with a
subtle gold pendant necklace. She stands in a modern glass-walled corporate
briefing room with floor-to-ceiling windows revealing soft morning light and
a blurred city skyline at golden hour. A large curved 4K display mounted on
the slate-gray wall behind her right shoulder shows an animated data
visualization: {INSIGHT_CHART_TYPE} — {INSIGHT_NARRATIVE}. Thin luminous
off-white lines, soft amber accent highlights, and discrete numeric callouts
animate subtly on the display.

She gestures with calm authority toward the chart using her right hand,
makes brief eye contact with the camera, and speaks with a warm, composed
cadence. Her expression conveys informed confidence — delivering important
quantitative insight without overstatement. Minimal body movement, natural
professional posture.

Shallow depth of field (f/2.0), warm neutral color palette matching the
Ledger intro: deep slate background, off-white principals, amber data
accents, warm skin tones, 3200K cinematic lighting, subtle lens flare from
the window. Camera holds steady with a 10% slow push-in. No text overlays —
captions added in post. Premium fintech documentary aesthetic.

--ratio 9:16 --resolution 720p --duration 5
```

## Placeholder substitution

- `{INSIGHT_CHART_TYPE}` — derived from the insight's numeric shape. Examples:
  - `a line chart trending upward 34% over 12 weeks`
  - `a horizontal bar chart comparing three creative variants`
  - `a donut chart showing channel mix across Meta, Google, and TikTok`
  - `a scatter plot of cost-per-acquisition vs. creative angle`
- `{INSIGHT_NARRATIVE}` — the insight text itself, trimmed to ~80 characters. Example: `testimonial creatives drove 2.3x higher ROAS than lifestyle variants`.

## Rationale (for tuning decisions)

- **9:16 portrait** — iMessage renders portrait natively; preserves vertical real estate for both the subject and the graph.
- **Shallow DOF (f/2.0)** — keeps the presenter sharp while the chart stays legible-but-secondary; avoids split attention that flat DOF would cause.
- **Warm neutral palette (slate + amber)** — matches the existing `assets/intro/intro.mp4` from `generate_intro.py` so stitched segments feel continuous.
- **5-second segments** — Seedance 2.0 fast model caps reliably at 5s; longer single generations get flaky. Twelve stitched 5s segments = ~60s brief.
- **10% slow push-in** — adds cinematic motion without risking Seedance auto-ruining the shot with erratic camera moves that happen at higher speeds.
- **No text overlays in the Seedance generation** — captions/insight text get added in FFmpeg post-processing for reliability. Seedance renders text poorly.

## Stitch continuity tips

Pass a consistent presenter description across all per-insight Seedance calls so the "same woman" shows up in every segment. Seedance does not keep state between calls — consistency comes entirely from stable wording in the prompt. Keep every segment's subject sentence byte-identical; only vary the `{INSIGHT_*}` placeholders.
