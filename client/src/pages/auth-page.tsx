import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Redirect } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { LockIcon, UserIcon, ClockIcon } from "lucide-react";

// Login Form Schema
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

// Registration Form Schema
const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
  terms: z.boolean().refine(val => val === true, {
    message: "You must agree to the terms and conditions",
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  // Handle login form submission
  function onLoginSubmit(data: LoginFormValues) {
    loginMutation.mutate({
      username: data.username,
      password: data.password,
    });
  }

  // Handle demo login
  function handleDemoLogin() {
    loginMutation.mutate({
      username: "demo",
      password: "1234",
    });
  }

  // Handle registration form submission
  function onRegisterSubmit(data: RegisterFormValues) {
    registerMutation.mutate({
      username: data.username,
      password: data.password,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
    });
  }

  // Redirect if user is already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="mt-8">
      <div className="md:grid md:grid-cols-3 md:gap-6">
        {/* Left Section */}
        <div className="md:col-span-1">
          <div className="px-4 sm:px-0">
            <h3 className="text-lg font-medium leading-6 text-neutral-900">Platform Authentication</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Login to TradeConnect to access your connected exchanges and brokers.
            </p>
            <div className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center text-sm text-neutral-700">
                  <LockIcon className="h-5 w-5 text-primary mr-2" />
                  <span>Secure credential storage</span>
                </div>
                <div className="flex items-center text-sm text-neutral-700">
                  <UserIcon className="h-5 w-5 text-primary mr-2" />
                  <span>End-to-end encryption</span>
                </div>
                <div className="flex items-center text-sm text-neutral-700">
                  <ClockIcon className="h-5 w-5 text-primary mr-2" />
                  <span>Session management</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Forms */}
        <div className="mt-5 md:mt-0 md:col-span-2">
          <Card>
            <CardContent className="pt-6 auth-form-container">
              {/* Login Form */}
              {isLogin ? (
                <div>
                  <h2 className="text-xl font-medium text-neutral-900 mb-6">Login to TradeConnect</h2>
                  
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter your username" 
                                {...field} 
                                autoComplete="username"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                placeholder="••••••••" 
                                {...field} 
                                autoComplete="current-password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-center justify-between">
                        <FormField
                          control={loginForm.control}
                          name="rememberMe"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                Remember me
                              </FormLabel>
                            </FormItem>
                          )}
                        />

                        <div className="text-sm">
                          <a href="#" className="font-medium text-primary hover:text-primary/80">
                            Forgot password?
                          </a>
                        </div>
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Logging in..." : "Login"}
                      </Button>
                      
                      <div className="text-center mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={handleDemoLogin}
                          disabled={loginMutation.isPending}
                        >
                          Demo Login (username: demo, password: 1234)
                        </Button>
                      </div>

                      <div className="text-center mt-4">
                        <span className="text-sm text-neutral-600">Don't have an account?</span>
                        <Button
                          type="button"
                          variant="link"
                          className="text-primary px-1 py-0 h-auto font-medium"
                          onClick={() => setIsLogin(false)}
                        >
                          Register
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              ) : (
                /* Registration Form */
                <div>
                  <h2 className="text-xl font-medium text-neutral-900 mb-6">Create TradeConnect Account</h2>
                  
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                          control={registerForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First name</FormLabel>
                              <FormControl>
                                <Input placeholder="John" {...field} autoComplete="given-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={registerForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last name</FormLabel>
                              <FormControl>
                                <Input placeholder="Doe" {...field} autoComplete="family-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={registerForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input 
                                type="email" 
                                id="email"
                                name="email"
                                placeholder="email@example.com"
                                autoComplete="email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="johndoe"
                                id="username"
                                name="username" 
                                autoComplete="username"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                id="password"
                                name="password"
                                placeholder="••••••••" 
                                autoComplete="new-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                id="confirmPassword"
                                placeholder="••••••••" 
                                autoComplete="new-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="terms"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                I agree to the <a href="#" className="text-primary hover:text-primary/80">Terms</a> and <a href="#" className="text-primary hover:text-primary/80">Privacy Policy</a>
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? "Creating account..." : "Register"}
                      </Button>

                      <div className="text-center mt-4">
                        <span className="text-sm text-neutral-600">Already have an account?</span>
                        <Button
                          type="button"
                          variant="link"
                          className="text-primary px-1 py-0 h-auto font-medium"
                          onClick={() => setIsLogin(true)}
                        >
                          Login
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
