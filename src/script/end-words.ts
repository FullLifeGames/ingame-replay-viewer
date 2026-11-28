// The words that end a battle, the same in every game backend (#118, D11): Gen 3 prints them in
// its own text, and Gen 5 prints them in Black 2's text box after the last turn.

/** The win line; `trainer` is the winner's name as the game shows it. */
export const won = (trainer: string) => `${trainer} won the battle!`

/** The tie line. */
export const tie = () => 'The battle ended in a tie!'
