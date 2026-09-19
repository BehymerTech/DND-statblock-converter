## {{icon}} {{name}}
*{{subtitle}}*

|{{#each stats}} {{icon}} {{label}} |{{/each}}
|{{#each stats}}:-:|{{/each}}
|{{#each stats}} {{value}} |{{/each}}

{{#each details}}{{icon}} **{{label}}** {{value}}

{{/each}}{{#if description}}### 📜 Description
{{description}}
{{/if}}
