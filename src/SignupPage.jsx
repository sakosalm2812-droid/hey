import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { press, springs } from "./lib/heyMotion";

import { useAuth } from "./AuthContext";

import styles from "./pages/Auth.module.css";


export default function SignupPage(){

const [name,setName]=useState("");
const [email,setEmail]=useState("");
const [password,setPassword]=useState("");

const [error,setError]=useState("");
const [loading,setLoading]=useState(false);
const [done,setDone]=useState(false);

const {signUp}=useAuth();


const handleSignup=async()=>{

if (!name.trim() || !email.trim() || password.length < 8) {
setError("Enter your name, a valid email address, and a password with at least 8 characters.");
return;
}

setLoading(true);
setError("");

const {error}=await signUp(email.trim(),password,name.trim());

if(error){

setError(error.message);
setLoading(false);

}

else{

setDone(true);

}

};



if(done){

return (

<div className={styles.page}>

<motion.div

className={styles.card}

initial={{opacity:0,scale:.9}}

animate={{opacity:1,scale:1}}

>

<div className={styles.brand}>
  <span className="hey-script">HEY</span>
  <small>Personal Intelligence System</small>
</div>

<p className={styles.subtitle}>
Welcome to your intelligence system, {name}.
</p>

<p className={styles.success} role="status" aria-live="polite">
Check your email to confirm your account.
</p>


</motion.div>

</div>

);

}



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
Create your intelligence system
</p>



{error &&

<p className={styles.error} role="alert" aria-live="polite">
{error}
</p>

}



<input

className={styles.input}

placeholder="Your name"

value={name}

onChange={e=>setName(e.target.value)}

autoComplete="name"

aria-label="Your name"

/>



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

autoComplete="new-password"

minLength={8}

aria-label="Password"

/>



<motion.button

className={styles.button}

whileHover={{scale:1.03, transition: springs.snappy}}

whileTap={{scale:.97, transition: press}}

onClick={handleSignup}

disabled={loading}

>

{loading ? "Creating..." : "Create account"}

</motion.button>



<p className={styles.subtitle}>

Already have an account?{" "}

<Link className={styles.link} to="/login">

Login

</Link>

</p>


</motion.div>


</div>

);

}
