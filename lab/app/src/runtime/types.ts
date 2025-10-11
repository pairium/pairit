export type ButtonAction = { type: 'go_to'; target: string };
export type Button = { id: string; text: string; action: ButtonAction };
export type ComponentInstance =
  | { type: 'text'; props: { text: string } }
  | { type: 'buttons'; props: { buttons: Button[] } };

export type Page = {
  id: string;
  end?: boolean;
  components?: ComponentInstance[];
};
