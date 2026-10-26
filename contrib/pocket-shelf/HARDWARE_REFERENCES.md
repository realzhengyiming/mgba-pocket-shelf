# Game Boy Advance model reference

The preview's handheld and cartridge are programmatically reconstructed from Nintendo's original AGB-001 product images and manual. They are visual approximations, not precision manufacturing CAD. No downloaded third-party mesh or Nintendo product photograph is embedded in the project.

## Dimensions

- AGB-001 body: **144.5 × 82 × 24.5 mm** (width × height × depth), from [Nintendo's hardware page](https://www.nintendo.com/en-gb/Hardware/Nintendo-History/Game-Boy-Advance/Game-Boy-Advance-627139.html).
- GBA Game Pak: **60 × 34.5 mm** (width × height), from [Nintendo's original Japanese GBA page](https://www.nintendo.co.jp/n08/hardware/gba/index.html), item 8.
- Cartridge depth and fine mold details are approximated. The modeled shell's width/height ratio and its size relative to the handheld follow the published dimensions.

The reference values and derived scene dimensions live in `preview/source/hardware.js`.

## Recognizable features

- Contoured horizontal body, wider shoulder grips, classic violet shell and gray L/R buttons.
- Gray D-pad and A/B buttons, with START and SELECT below the D-pad on the left.
- Dark display lens surrounding a 3:2 screen, diagonal speaker slits, power light and rear battery cover.
- Short, wide gray GBA Game Pak shell, raised top stop, recessed label and one rear screw.

## Insertion direction

[Nintendo's AGB-001 instruction booklet](https://www.nintendo.com/eu/media/downloads/support_1/game_boy_advance_4/GBA_Manual_UK_DE_FR.pdf), printed page 10, places the Game Pak slot in the back and tells the player to keep the label facing away from the system.

The preview therefore turns the handheld around, slides the label-out cartridge down the back guide rails, seats the short pak close to the top edge, then turns the handheld forward before the simulated power-on. Ejection reverses this order. A workbench control exposes the back for visual inspection.

Nintendo and Game Boy Advance names identify the hardware being depicted. They remain their owners' trademarks; this is an independent frontend experiment.
