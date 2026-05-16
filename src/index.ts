export interface WidgetThemePreset {
  placement?: string;
  variant?: string;
  defaultExpanded?: boolean;
  dismissible?: boolean;
  styles?: Record<string, string | number>;
  textContents?: Record<string, string>;
}

export interface WidgetBootstrapOptions {
  tagName?: string;
  preset?: WidgetThemePreset;
}

export function defineWidgetBootstrap(options: WidgetBootstrapOptions = {}) {
  return {
    tagName: options.tagName ?? "conversales-convai",
    preset: options.preset ?? {},
  };
}
