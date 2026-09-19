{{! Not wired up to the converter yet — see src/exporters/pf2.js. Kept here so
    the template set covers all five systems named in the README, ready for
    whenever PF2 conversion math is defined. }}
## {{name}} (Level {{level}})

**{{alignment}} {{size}} {{type}}**

**Perception** {{plus mods.wis}}{{#if sensesLine}}; {{sensesLine}}{{/if}}
**Languages** {{languagesLine}}
**Skills** {{skillsLine}}

**AC** {{ac}}; **Saves** {{savesLine}}
**HP** {{hpAverage}}

**Speed** {{speedText}}

{{#each actions}}**{{name}}** {{text}}

{{/each}}
