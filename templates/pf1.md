## {{name}}
CR {{cr}}{{#if xp}}; XP {{xp}}{{/if}}

**{{alignment}} {{size}} {{type}}{{#if subtype}} ({{subtype}}){{/if}}**
**Init** {{initiative}}{{#if senses}}; **Senses** {{senses}}{{/if}}

**DEFENSE**

**AC** {{ac}}{{#if acNotes}} ({{acNotes}}){{/if}}{{#if touch}}, touch {{touch}}{{/if}}{{#if flatFooted}}, flat-footed {{flatFooted}}{{/if}}
**hp** {{hpAverage}} ({{hpFormula}})
{{saves}}

**OFFENSE**

**Speed** {{speedText}}
{{#each actions}}**{{name}}** {{text}}
{{/each}}

**STATISTICS**

**Str** {{abilities.str}}, **Dex** {{abilities.dex}}, **Con** {{abilities.con}}, **Int** {{abilities.int}}, **Wis** {{abilities.wis}}, **Cha** {{abilities.cha}}
**Base Atk** {{bab}}; **CMB** {{cmb}}; **CMD** {{cmd}}
{{#if feats}}**Feats** {{feats}}
{{/if}}{{#if skillsText}}**Skills** {{skillsText}}
{{/if}}{{#if languages}}**Languages** {{languages}}
{{/if}}

{{#if traits}}**SPECIAL ABILITIES**

{{#each traits}}**{{name}}** {{text}}

{{/each}}{{/if}}
