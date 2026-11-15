# Asset audit and licensing check

This audit is for internal review before public or commercial launch. It is not legal advice.

## 1) Assets with clear provenance

### Lucide token set
- Directory: `public/assets/tokens/`
- Source: Lucide (exported from lucide-react)
- Licensing: license file exists in the same folder (`LICENSE.txt`)
- Status: suitable for commercial use only if the project respects the referenced license terms and attribution requirements in the library documentation.

## 2) Assets without clear commercial-use evidence

### AI-generated images in app sources
- `src/assets/images/monopoly_luxury_crest_1793789549246.jpg`
- `src/assets/images/monopoly_penthouse_bg_1793789505568.jpg`
- `src/assets/images/vintage_chance_art_1793789520123.jpg`
- `src/assets/images/vintage_chest_art_1793789535410.jpg`
- `public/assets/aistudio/IMG_0165_afd12a1f.png`
- `public/assets/aistudio/IMG_0167_e8a7d590.png`

These files are not paired with a license file, author declaration, or source contract in the repository. Their names and metadata suggest a generated-art workflow, but there is no explicit permission record for commercial deployment.

Status: high-risk for commercial launch until the source is replaced with licensed assets or written permission is obtained.

## 3) Confirmed non-asset cleanup

The following Firebase leftovers are unused in the current application and should be removed before production publication:
- `firebase-applet-config.json`
- `firebase-blueprint.json`
- `firestore.rules`

## 4) Recommended next step

Before launch, replace all unlicensed generated art with:
- licensed stock assets,
- self-created original artwork,
- or assets with written commercial-use rights from the creator.

Do not ship the current AI-generated imagery without that clearance.
