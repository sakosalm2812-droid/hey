import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { press, springs } from "./lib/heyMotion";

import { useAuth } from "./AuthContext";

import styles from "./pages/Auth.module.css";


export default function LoginPage(){

const [email,setEmail]=useState("");
const [password,setPassword]=useState("");

const [error,setError]=useState("");
const [loading,setLoading]=useState(false);

const [mode,setMode]=useState("login");
const [resetSent,setResetSent]=useState(false);
const [resetLoading,setResetLoading]=useState(false);


const {signIn,resetPassword}=useAuth();

const navigate=useNavigate();
const location=useLocation();



const handleLogin=async()=>{

if (!email.trim() || !password) {
setError("Enter your email address and password.");
return;
}

setLoading(true);
setError("");

const {error}=await signIn(email.trim(),password);


if(error){

setError(error.message);
setLoading(false);

}

else{
const requestedPath = new URLSearchParams(location.search).get("next");
const destination = requestedPath?.startsWith("/") ? requestedPath : "/chat";
navigate(destination);

}


};

const handleReset=async()=>{

if (!email.trim()) {
setError("Enter the email address you signed up with.");
return;
}

setResetLoading(true);
setError("");
setResetSent(false);

const {error}=await resetPassword(email.trim());

setResetLoading(false);

if(error){
setError(error.message);
return;
}

setResetSent(true);

};

const backToLogin=()=>{
setMode("login");
setError("");
setResetSent(false);
};



return (

<div className={styles.page}>


<motion.div

className={styles.card}

initial={{opacity:0,y:30}}

animate={{opacity:1,y:0}}

>


<div className={styles.brand}>
  <span className="hey-script">HEY</span>
  <small>Personal Intelligence System</small>
</div>


<p className={styles.subtitle}>
{mode === "forgot" ? "Reset your password" : "Welcome back"}
</p>



{error &&

<p className={styles.error} role="alert" aria-live="polite">
{error}
</p>

}

{resetSent &&

<p className={styles.success} role="status">
Reset link sent. Check your inbox and open it in this browser to choose a new password.
</p>

}



{mode === "login" ? (
<>

<input

className={styles.input}

placeholder="Email"

value={email}

onChange={e=>setEmail(e.target.value)}

type="email"

autoComplete="email"

aria-label="Email address"

/>



<input

className={styles.input}

type="password"

placeholder="Password"

value={password}

onChange={e=>setPassword(e.target.value)}

autoComplete="current-password"

aria-label="Password"

onKeyDown={e=>{

if(e.key==="Enter") handleLogin();

}}

/>



<motion.button

className={styles.button}

whileHover={{scale:1.03, transition: springs.snappy}}

whileTap={{scale:.97, transition: press}}

onClick={handleLogin}

disabled={loading}

>

{loading ? "Entering..." : "Enter HEY"}

</motion.button>



<button
type="button"
className={styles.link}
style={{ display:"block", marginTop:16, marginInline:"auto", background:"none", border:"none", cursor:"pointer", fontSize:13 }}
onClick={()=>{setMode("forgot");setError("");}}
>
Forgot password?
</button>



<p className={styles.subtitle}>

New here?{" "}

<Link className={styles.link} to="/signup">

Create account

</Link>

</p>
</>
) : (
<>
{!resetSent && (
<>

<input

className={styles.input}

placeholder="Email"

value={email}

onChange={e=>setEmail(e.target.value)}

type="email"

autoComplete="email"

aria-label="Email address"

onKeyDown={e=>{

if(e.key==="Enter") handleReset();

}}

/>



<motion.button

className={styles.button}

whileHover={{scale:1.03, transition: springs.snappy}}

whileTap={{scale:.97, transition: press}}

onClick={handleReset}

disabled={resetLoading}

>

{resetLoading ? "Sending..." : "Send reset link"}

</motion.button>
</>
)}



<button
type="button"
className={styles.link}
style={{ display:"block", marginTop:16, marginInline:"auto", background:"none", border:"none", cursor:"pointer", fontSize:13 }}
onClick={backToLogin}
>
Back to login
</button>
</>
)}



</motion.div>


</div>

);

}
