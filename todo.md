# Todo

get pairit complete with surveys first
- [x] visual feedback for buttons
- [x] fix survey required items
- [x] add back button
- [x] media in Cloud Storage, keep metadata in Firestore
- [ ] `pairit --help`
- [ ] firestore events
- [ ] simplify runtime
  > strip redundant logic from the normalizer. i want to keep the runtime minimal. when we add new properties and components, can we just add it to the component and the config? i don't want the runtime to care about the specific components, just some abstractions of the components. and capture a note in the docs that future additions should live in components plus config when possible.
- [ ] add paginated survey component
- [ ] sessions
  - [ ] auth?
  - [ ] store data
  - [ ] user id
- [ ] cli auth
- [ ] make app & docs look nice like [shadcn](https://ui.shadcn.com/)

## Backlog

- [ ] agents
- [ ] chat
- [ ] live workspace
