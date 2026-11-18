# Last Harvest asset provenance

This file records only sources and licenses that are documented in the repository. A filename or visual style is not evidence of a license.

## Audio

- The retro game music pack is documented in [CC0-MUSIC.md](audio/last-harvest/CC0-MUSIC.md), including its composer, OpenGameArt source, CC0 1.0 dedication, and runtime-copy hashes.
- Dialogue blips are synthesized with Web Audio in `js/last-harvest.js`; they do not require a third-party audio file.
- The former `audio/last-harvest/talk.mp3` file was removed because this PR did not document its source or license.

## Images and sprite sheets requiring contributor confirmation

The current PR documentation does not establish the original creator/source and redistribution license for the following image assets. They are **not marked as cleared for public distribution** by this manifest:

- Root sprite sheets: `img/anime.png`, `img/anime_portraits.png`, `img/bosses.png`, `img/character_views.png`, `img/interior.png`, `img/people.png`.
- Last Harvest art: `img/last-harvest/IMG_0009.png`, `img/last-harvest/IMG_0010.png`, `img/last-harvest/anime.png`, `img/last-harvest/buildings.png`, `img/last-harvest/characters.png`, `img/last-harvest/gear.png`, `img/last-harvest/heart.png`, `img/last-harvest/kenney.png`, `img/last-harvest/monsters.png`, `img/last-harvest/people.png`, `img/last-harvest/trainers.png`, `img/last-harvest/ui-brown.png`, `img/last-harvest/ui-cream.png`, `img/last-harvest/ui-ribbon.png`, `img/last-harvest/ui-steel.png`, `img/last-harvest/village.png`, and `img/last-harvest/wilds.png`.
- Item art: `img/last-harvest/items/charm.png`, `cider.png`, `ember.png`, `ether.png`, `potion.png`, and `restock.png`.

Before public release, the contributor who supplied each image must identify whether it is original work or third-party material. For third-party material, record the exact source URL, creator, license/version, required attribution, and any modifications. For original work, record the creator and confirm that the project has permission to distribute it under the repository's license.

## Release verification still required

The deployed site's image/audio requests and sprite-sheet dimensions have not been independently verified in a browser as part of this source-only change. Complete that check on a preview deployment before merging.
