grammar Scad

entry Input: statements+=Statement*; 
Statement: 
    ';'
    | BlockStatement
    | ModuleInstantiation
    | Assignment 
    | ModuleDefinition
    | FunctionDefinition
    | Include
    | Use
    ;
Include: 'include' file=FILE_REFERENCE ';' ;
Use: 'use' file=FILE_REFERENCE ';' ;
BlockStatement: '{' stmts+=Statement* '}';
ModuleDefinition: MODULE name=ID '(' params= Parameters ')'  body=Statement; 
FunctionDefinition: FUNCTION name=ID '(' params=Parameters ')' '=' expr=Expr ';' ; 

Assignment: var=VariableDefinition '=' exp=Expr ';' ; 

// definition of any variable (assignment, parameter). This will be referenced from expressions
VariableDefinition: name=ID; 

ModuleInstantiation: ('!'|'#'|'%'|'*')* (
    module=SingleModuleInstantiation child=ChildStatement 
    | ECHO '('( (ID '=' )?expr+=Expr (',' (ID '=' )? expr+=Expr)*)? ')' ';'
    | ASSERT '(' expr=Expr (',' STRING)? ')' ';'
    | ifElse=IfelseStatement
); 
IfelseStatement: ifStmt=IfStatement (ELSE elseBranch=ChildStatement)?; 
IfStatement: IF '(' condition=Expr ')' body=ChildStatement; 

ChildStatement: ';' | block=ChildBlock | module=ModuleInstantiation; 
ChildBlock:'{' stmts+=ChildBlockStatement*  '}';
ChildBlockStatement: ChildStatement | Assignment;

ModuleId: id=[ModuleDefinition]|FOR|LET|EACH; 

SingleModuleInstantiation: id=ModuleId '(' args=Arguments ')';

Expr: 
    or=LogicOr ('?' trueExpr=Expr ':' falseExpr=Expr)?
    | inline=Expr_InlineFunctionDefinition
    | LET '(' let=Expr_LetFirst
    | assertEcho=Expr_AssertEcho; 
Expr_AssertEcho: (ASSERT|ECHO) '(' ((ID '=' )? expr+=Expr)* ')' expr+=Expr?;
Expr_LetFirst:  var=VariableDefinition '=' varExpr=Expr inner=Expr_Let| end=Expr_LetEnd;
Expr_Let:  ',' var=VariableDefinition '=' varExpr=Expr inner=Expr_Let | end=Expr_LetEnd;
Expr_LetEnd:  ')' (body=Expr|bodyLc=ListComprehensionElementP);
Expr_InlineFunctionDefinition: FUNCTION '(' params=Parameters ')' expr=Expr;
LogicOr: expr+=LogicAnd ('||' expr+=LogicAnd )*; 
LogicAnd: expr+= Equality ('&&' expr+=Equality)*; 
Equality: expr+=Comparison (('='|'!=') expr+=Comparison)*; 
Comparison: expr+=Addition (('>'|'>='|'<'|'<=') expr+=Addition)*;  
Addition: expr+=Multiplication (('+'|'-') expr+=Multiplication)*;
Multiplication: expr+=Unary (('*'|'/'|'%') expr+=Unary)*;
Unary: ('+'|'-'|'!')* expr=Exponent; 
Exponent: call=Call ('^' unary=Unary)?; 
Call: target=Primary (
    call=Call_Function
    | '[' expr=Expr ']'
    | '.' axis=ID
)*; 
Call_Function: '(' args+=Arguments ')' ;

Primary:
'true'|'false'|'undef'|number=NUMBER|string=STRING|var=[VariableDefinition]
| paren=Primary_Parentheses
|  '[' vector=Primary_Vector? ']'; 
Primary_Vector:  
    expr+=Expr (
        ':' expr+=Expr (':' expr+=Expr)? // range 
        |  (',' exp+=Expr )* ','? // vector
    )
    | v+=ListComprehensionElementP (',' v+=ListComprehensionElementP)* ','? ;
Primary_Parentheses: '(' expr=Expr ')';

ListComprehensionElementP: e=ListComprehensionElement | '(' e=ListComprehensionElement ')'; 
ListComprehensionElement:
    EACH v+=ListComprehensionElementOrExpr
    | for=ListComprehensionElement_For
    | IF '(' expr=Expr ')' v+=ListComprehensionElementOrExpr ( ELSE v+= ListComprehensionElementOrExpr) ; 
ListComprehensionElement_For: FOR '(' args=Arguments (';' expr=Expr ';' args2=Arguments)? ')' v+=ListComprehensionElementOrExpr;
ListComprehensionElementOrExpr: elements=ListComprehensionElementP | expr=Expr;

Parameters: (params+=Parameter (',' params+=Parameter)* ','?)?; 
Parameter: def=ParameterDefinition ('=' defaultExpr=Expr)?; 

// Definition/name of a parameter. This is referenced from module/function calls. In addition, it is 
// registered as VariableDefinition for the corresponding module/function body
ParameterDefinition: name=ID; 

Arguments: (args+=Argument (',' args+=Argument)* ','?)?; 
Argument: (param=[ParameterDefinition] '=' )? expr=Expr; 

hidden terminal WS: /\s+/;

terminal FOR: /for/;
terminal LET: /let/;
terminal ASSERT: /assert/;
terminal ECHO: /echo/;
terminal EACH: /each/;
terminal FUNCTION: /function/;
terminal MODULE: /module/;
terminal IF: /if/;
terminal ELSE: /else/;

terminal NUMBER returns number: /([0-9]+(\.[0-9]*)?|\.[0-9]+)(e[+-]?[0-9]+)?/;
terminal ID: /\$?[a-zA-Z0-9_]+/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal FILE_REFERENCE: /\<[^>]*\>/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
