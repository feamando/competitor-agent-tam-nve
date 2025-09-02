/**
 * Design System Component Test
 * A test component to verify shadcn/ui integration with our design tokens
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ComponentTest() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground">Design System Test</h1>
      
      {/* Button variants */}
      <Card>
        <CardHeader>
          <CardTitle>Button Components</CardTitle>
          <CardDescription>
            Testing different button variants with our design tokens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Button variant="default">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="destructive">Destructive Button</Button>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <Button size="sm">Small Button</Button>
            <Button size="default">Default Button</Button>
            <Button size="lg">Large Button</Button>
          </div>
        </CardContent>
      </Card>

      {/* Form inputs */}
      <Card>
        <CardHeader>
          <CardTitle>Form Components</CardTitle>
          <CardDescription>
            Testing form inputs with our design tokens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Default input" />
            <Input placeholder="Disabled input" disabled />
          </div>
          <Input placeholder="Full width input" className="w-full" />
        </CardContent>
      </Card>

      {/* Card examples */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Brand Colors</CardTitle>
            <CardDescription>Testing our brand color tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-brand-primary"></div>
                <span className="text-sm">Brand Primary</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-brand-secondary"></div>
                <span className="text-sm">Brand Secondary</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-brand-accent"></div>
                <span className="text-sm">Brand Accent</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feedback Colors</CardTitle>
            <CardDescription>Testing our feedback color tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-feedback-success"></div>
                <span className="text-sm">Success</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-feedback-error"></div>
                <span className="text-sm">Error</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-feedback-warning"></div>
                <span className="text-sm">Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-feedback-info"></div>
                <span className="text-sm">Info</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog example */}
      <Card>
        <CardHeader>
          <CardTitle>Dialog Component</CardTitle>
          <CardDescription>
            Testing modal dialog with our design tokens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Design System Dialog</DialogTitle>
                <DialogDescription>
                  This dialog uses our design tokens for consistent styling.
                  The background, text colors, and spacing all come from our token system.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input placeholder="Test input in dialog" />
                <div className="flex justify-end gap-2">
                  <Button variant="outline">Cancel</Button>
                  <Button>Confirm</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
