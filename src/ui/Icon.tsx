export function Icon(props: { name: 'search' | 'settings' | 'chevron' | 'plus' | 'close' }) {
  const paths = {
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    chevron: 'm9 5 7 7-7 7',
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return (
    <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[props.name]} />
    </svg>
  );
}
