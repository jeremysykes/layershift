import * as React from 'react';
import { cn } from '../../lib/utils';

/* ------------------------------------------------------------------ */
/* Tabs root                                                           */
/* ------------------------------------------------------------------ */

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>');
  return ctx;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value: controlledValue, defaultValue = '', onValueChange, className, children, ...props }, ref) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const value = controlledValue ?? uncontrolledValue;
    const handleChange = React.useCallback(
      (v: string) => {
        setUncontrolledValue(v);
        onValueChange?.(v);
      },
      [onValueChange],
    );

    return (
      <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
        <div ref={ref} className={cn(className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = 'Tabs';

/* ------------------------------------------------------------------ */
/* TabsList                                                            */
/* ------------------------------------------------------------------ */

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn('flex gap-0 overflow-x-auto', className)}
      style={{ borderBottom: '1px solid #222', WebkitOverflowScrolling: 'touch', ...style }}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

/* ------------------------------------------------------------------ */
/* TabsTrigger                                                         */
/* ------------------------------------------------------------------ */

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const { value: selectedValue, onValueChange } = useTabs();
    const isActive = selectedValue === value;

    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        aria-selected={isActive}
        className={cn('relative shrink-0 px-4 py-3 text-sm font-medium cursor-pointer transition-colors', isActive && 'active', className)}
        style={{
          background: 'none',
          border: 'none',
          color: isActive ? '#fff' : '#666',
          fontFamily: 'inherit',
        }}
        onClick={() => onValueChange(value)}
        {...props}
      >
        {props.children}
        {isActive && (
          <span
            style={{
              position: 'absolute',
              bottom: '-1px',
              left: 0,
              right: 0,
              height: '1px',
              background: '#fff',
            }}
          />
        )}
      </button>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

/* ------------------------------------------------------------------ */
/* TabsContent                                                         */
/* ------------------------------------------------------------------ */

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { value: selectedValue } = useTabs();
    if (selectedValue !== value) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn(className)}
        {...props}
      />
    );
  },
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
