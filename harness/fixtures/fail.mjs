// Fixture: synthetic task acceptance that MUST fail, so the harness can prove
// that a failing gate blocks progress instead of being bypassed.
console.error('fixture:fail — deliberate acceptance failure');
process.exit(1);
