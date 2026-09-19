## {{name}}
**{{size}} {{type}}{{#if subtype}} ({{subtype}}){{/if}}**

**Hit Dice:** {{hpFormula}} ({{hpAverage}} hp)
**Initiative:** {{initiative}}
**Speed:** {{speedText}}
**Armor Class:** {{ac}}{{#if acNotes}} ({{acNotes}}){{/if}}{{#if touch}}, touch {{touch}}{{/if}}{{#if flatFooted}}, flat-footed {{flatFooted}}{{/if}}
**Base Attack/Grapple:** {{bab}}/{{grapple}}
{{#each actions}}**{{name}}:** {{text}}
{{/each}}**Saves:** {{saves}}
**Abilities:** Str {{abilities.str}}, Dex {{abilities.dex}}, Con {{abilities.con}}, Int {{abilities.int}}, Wis {{abilities.wis}}, Cha {{abilities.cha}}
{{#if skillsText}}**Skills:** {{skillsText}}
{{/if}}{{#if feats}}**Feats:** {{feats}}
{{/if}}{{#if senses}}**Special Qualities:** {{senses}}
{{/if}}**Challenge Rating:** {{cr}}
**Alignment:** {{alignment}}

{{#each traits}}#### {{name}}
{{text}}

{{/each}}
