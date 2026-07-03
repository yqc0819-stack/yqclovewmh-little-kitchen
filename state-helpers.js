(function exposeKitchenState(root) {
  function removeDishFromState(sourceState, id) {
    const nextState = structuredClone(sourceState);
    nextState.dishes = nextState.dishes.filter(item => item.id !== id);
    nextState.todayMenu = nextState.todayMenu.filter(item => item !== id);
    nextState.draftMenu = nextState.draftMenu.filter(item => item !== id);
    nextState.selected = nextState.selected.filter(item => item !== id);
    nextState.history = nextState.history
      .map(item => ({ ...item, dishIds: item.dishIds.filter(dishId => dishId !== id) }))
      .filter(item => item.dishIds.length > 0);
    if (nextState.submission) {
      nextState.submission.dishIds = nextState.submission.dishIds.filter(item => item !== id);
    }
    return nextState;
  }

  function updateDishInState(sourceState, id, updates) {
    const nextState = structuredClone(sourceState);
    nextState.dishes = nextState.dishes.map(dish =>
      dish.id === id ? { ...dish, ...updates, id } : dish
    );
    return nextState;
  }

  root.KitchenState = { removeDishFromState, updateDishInState };
})(globalThis);
