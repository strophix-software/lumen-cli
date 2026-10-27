import { useState, useEffect } from 'react';

export function use{{Name}}() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    fetch('/api/{{nameKebab}}')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch {{name}}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    data,
    loading,
    error,
  };
}

export default use{{Name}};
