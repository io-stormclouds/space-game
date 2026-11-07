// Single source guard: Atanor recipe levels repeat the recipe of the economy catalog in their
// layout (ports, molecule). If the catalog changes, this test fails until the level follows.
import { describe, expect, it } from 'vitest';
import { RECIPE_DATA } from '../../economy';
import { RECIPE_LEVELS } from '../engine/recipes';

describe('Atanor recipe levels match the economy catalog', () => {
  for (const level of RECIPE_LEVELS) {
    const recipe = (level as { recipe?: { recipeId: string; inputs: object; outputs: object } }).recipe!;
    it(`${recipe.recipeId}: inputs and outputs`, () => {
      const data = RECIPE_DATA.find((r) => r.id === recipe.recipeId);
      expect(data, recipe.recipeId).toBeDefined();
      expect(recipe.inputs).toEqual(data!.inp);
      expect(recipe.outputs).toEqual(data!.out);
    });
  }
});
